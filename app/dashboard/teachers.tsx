"use client";

/**
 * Teachers.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE TEACHER MANAGEMENT PAGE
 * ---------------------------------------------------------
 *
 * DB table: teachers
 *
 * Teacher connects to:
 * - Organizations / departments
 * - Assignments
 * - ClassSubject teacher assignment
 * - ClassTeacher
 * - Teacher Attendance
 *
 * Architecture:
 * Active Account -> Active School -> Active Branch -> Teachers
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - All reads/writes are scoped by accountId + schoolId + branchId.
 * - Soft delete only.
 * - Mobile-first cards and responsive drawer.
 * - Dashboard-shell safe: no horizontal overflow.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";
import { SyncStatus } from "../lib/constants/syncStatus";

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

// ======================================================
// TYPES
// ======================================================

type TeacherRole = "teacher" | "head_teacher" | "lecturer" | "principal";

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

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

const emptyForm: FormState = {
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
};

function roleLabel(role?: TeacherRole) {
  if (role === "head_teacher") return "Head Teacher";
  if (role === "principal") return "Principal";
  if (role === "lecturer") return "Lecturer";
  return "Teacher";
}

function roleTone(role?: TeacherRole): "green" | "blue" | "purple" | "orange" {
  if (role === "principal") return "purple";
  if (role === "head_teacher") return "orange";
  if (role === "lecturer") return "blue";
  return "green";
}

// ======================================================
// COMPONENT
// ======================================================

export default function TeachersPage() {
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

  const [pageLoading, setPageLoading] = useState(true);
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
    setOrganizations([]);
    setAssignments([]);
    setClassSubjects([]);
    setClassTeachers([]);
    setTeacherAttendance([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setPageLoading(false);
      return;
    }

    try {
      setPageLoading(true);

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

      setRows(
        teacherRows
          .filter(sameTenant)
          .sort((a, b) => a.fullName.localeCompare(b.fullName))
      );

      setOrganizations(
        organizationRows
          .filter((row) => sameTenant(row) && row.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setAssignments(assignmentRows.filter(sameTenant));
      setClassSubjects(classSubjectRows.filter(sameTenant));
      setClassTeachers(classTeacherRows.filter(sameTenant));
      setTeacherAttendance(attendanceRows.filter(sameTenant));
    } catch (error) {
      console.error("Failed to load teachers:", error);
      clearData();
      alert("Failed to load teachers");
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

  const organizationMap = useMemo(
    () => new Map(organizations.map((row) => [row.id, row])),
    [organizations]
  );

  const usageMaps = useMemo(() => {
    const assignmentMap = new Map<number, number>();
    const classSubjectMap = new Map<number, number>();
    const classTeacherMap = new Map<number, number>();
    const attendanceMap = new Map<number, number>();

    assignments.forEach((row) => {
      assignmentMap.set(row.teacherId, (assignmentMap.get(row.teacherId) || 0) + 1);
    });

    classSubjects.forEach((row) => {
      if (!row.teacherId) return;
      classSubjectMap.set(row.teacherId, (classSubjectMap.get(row.teacherId) || 0) + 1);
    });

    classTeachers.forEach((row) => {
      classTeacherMap.set(row.teacherId, (classTeacherMap.get(row.teacherId) || 0) + 1);
    });

    teacherAttendance.forEach((row) => {
      attendanceMap.set(row.teacherId, (attendanceMap.get(row.teacherId) || 0) + 1);
    });

    return { assignmentMap, classSubjectMap, classTeacherMap, attendanceMap };
  }, [assignments, classSubjects, classTeachers, teacherAttendance]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<TeacherView[]>(() => {
    return rows.map((row) => {
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
      .filter((item) => {
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
      active: rows.filter((row) => row.active !== false).length,
      inactive: rows.filter((row) => row.active === false).length,
      teachers: rows.filter((row) => row.role === "teacher").length,
      leaders: rows.filter((row) => row.role === "head_teacher" || row.role === "principal").length,
      attendanceRecords: teacherAttendance.length,
    };
  }, [rows, teacherAttendance.length]);

  const genderOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.gender).filter(Boolean))) as string[];
  }, [rows]);

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

  const handleImageUpload = async (
    field: "photo" | "coverPhoto" | "signature",
    file?: File
  ) => {
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
    if (!authenticated || !accountId) return "Sign in first";
    if (!schoolId) return "Select a school first";
    if (!branchId) return "Select a branch first";
    if (!form.fullName.trim()) return "Enter teacher full name";
    if (!form.role) return "Select teacher role";

    if (form.organizationId && !organizationMap.get(Number(form.organizationId))) {
      return "Selected organization is not in this branch";
    }

    const duplicate = rows.find((row) => {
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

    if (!authenticated || !accountId || !schoolId || !branchId) return;

    try {
      setSaving(true);

      const existing = editMode && form.id ? rows.find((row) => row.id === form.id) : undefined;

      const payload = prepareSyncData(
        {
          accountId,
          schoolId: Number(schoolId),
          branchId: Number(branchId),
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
        },
        existing
      ) as Teacher;

      if (editMode && form.id) {
        await db.teachers.update(form.id, {
          accountId: payload.accountId,
          schoolId: payload.schoolId,
          branchId: payload.branchId,
          cloudId: payload.cloudId,
          createdAt: payload.createdAt,
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
        } as Partial<Teacher>);
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

    const usage = viewRows.find((item) => item.row.id === id);
    const totalUsage = usage
      ? usage.assignmentCount +
        usage.classSubjectCount +
        usage.classTeacherCount +
        usage.attendanceCount
      : 0;

    if (totalUsage) {
      const proceed = confirm(`This teacher has ${totalUsage} related record(s). Delete anyway?`);
      if (!proceed) return;
    } else if (!confirm("Delete this teacher?")) {
      return;
    }

    await db.teachers.update(id, {
      isDeleted: true,
      synced: SyncStatus.PENDING,
      updatedAt: Date.now(),
    } as Partial<Teacher>);

    await load();
  };

  const toggleActive = async (row: Teacher) => {
    if (!row.id) return;

    await db.teachers.update(row.id, {
      active: row.active === false,
      synced: SyncStatus.PENDING,
      updatedAt: Date.now(),
    } as Partial<Teacher>);

    await load();
  };

  // ======================================================
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || pageLoading) {
    return (
      <main className="tea-page" style={{ "--tea-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="tea-state-card">
          <div className="tea-spinner" />
          <h2>Opening teachers...</h2>
          <p>Checking account, branch, teacher records, organizations, assignments, and attendance links.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="tea-page" style={{ "--tea-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="tea-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing teachers.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="tea-page" style={{ "--tea-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="tea-state-card">
          <h2>Select a branch first</h2>
          <p>Teachers belong to one active school branch.</p>
          <button type="button" className="tea-primary-btn" onClick={() => router.push("/account")}>
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
    <main className="tea-page" style={{ "--tea-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="tea-hero">
        <div className="tea-hero-left">
          <div className="tea-hero-icon">👩‍🏫</div>
          <div className="tea-title-wrap">
            <p>Staff Records</p>
            <h2>Teachers</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <button type="button" className="tea-primary-btn" onClick={openCreate}>
          + Add Teacher
        </button>
      </section>

      <section className="tea-context-card">
        <div>
          <p>Teacher Scope</p>
          <h3>{summary.active} active teacher(s)</h3>
          <span>{summary.total} total teacher record(s) in this branch</span>
        </div>
        <div className="tea-pill-row">
          <Chip tone="blue">Same Tenant</Chip>
          <Chip tone="green">Branch Scoped</Chip>
          <Chip tone="purple">Staff Linked</Chip>
        </div>
      </section>

      <section className="tea-summary-grid" aria-label="Teacher summary">
        <SummaryCard label="Total Teachers" value={summary.total} icon="👥" />
        <SummaryCard label="Active" value={summary.active} icon="✅" />
        <SummaryCard label="Inactive" value={summary.inactive} icon="⏸️" />
        <SummaryCard label="Classroom Teachers" value={summary.teachers} icon="🏫" />
        <SummaryCard label="Leadership" value={summary.leaders} icon="⭐" />
        <SummaryCard label="Attendance Records" value={summary.attendanceRecords} icon="🕒" />
      </section>

      <section className="tea-filter-card">
        <input
          placeholder="Search name, phone, email, qualification..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select
          value={filterOrganizationId || ""}
          onChange={(event) => setFilterOrganizationId(Number(event.target.value) || undefined)}
        >
          <option value="">All Organizations</option>
          {organizations.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name} · {row.type}
            </option>
          ))}
        </select>

        <select
          value={filterRole}
          onChange={(event) => setFilterRole(event.target.value as "all" | TeacherRole)}
        >
          <option value="all">All Roles</option>
          <option value="teacher">Teacher</option>
          <option value="head_teacher">Head Teacher</option>
          <option value="lecturer">Lecturer</option>
          <option value="principal">Principal</option>
        </select>

        <select
          value={filterStatus}
          onChange={(event) => setFilterStatus(event.target.value as "all" | "active" | "inactive")}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <select value={filterGender} onChange={(event) => setFilterGender(event.target.value)}>
          <option value="all">All Gender</option>
          {genderOptions.map((gender) => (
            <option key={gender} value={gender}>
              {gender}
            </option>
          ))}
        </select>
      </section>

      <section className="tea-list">
        {filteredRows.map((item) => {
          const row = item.row;

          return (
            <article key={row.id} className="tea-card">
              {row.coverPhoto && (
                <div
                  className="tea-cover"
                  style={{
                    backgroundImage: `linear-gradient(135deg, rgba(15,23,42,.46), rgba(15,23,42,.08)), url(${row.coverPhoto})`,
                  }}
                />
              )}

              <div className="tea-card-inner">
                <div className="tea-card-top">
                  <div
                    className="tea-avatar"
                    style={{
                      background: row.photo
                        ? `url(${row.photo}) center/cover`
                        : `linear-gradient(135deg, ${primary}, rgba(255,255,255,.2))`,
                    }}
                  >
                    {!row.photo && row.fullName.slice(0, 1).toUpperCase()}
                  </div>

                  <div className="tea-main-info">
                    <h3>{row.fullName}</h3>
                    <p>{item.organizationName}{row.qualification ? ` · ${row.qualification}` : ""}</p>

                    <div className="tea-chip-row">
                      <Chip tone={roleTone(row.role)}>{roleLabel(row.role)}</Chip>
                      <Chip tone={row.active === false ? "red" : "green"}>{row.active === false ? "Inactive" : "Active"}</Chip>
                      {row.gender && <Chip tone="blue">{row.gender}</Chip>}
                    </div>
                  </div>
                </div>

                <div className="tea-mini-grid">
                  <MiniStat label="Assignments" value={item.assignmentCount} />
                  <MiniStat label="Class Subjects" value={item.classSubjectCount} />
                  <MiniStat label="Class Teacher Roles" value={item.classTeacherCount} />
                  <MiniStat label="Attendance" value={item.attendanceCount} />
                </div>

                <div className="tea-contact-row">
                  {row.phone && <Chip tone="gray">{row.phone}</Chip>}
                  {row.email && <Chip tone="gray">{row.email}</Chip>}
                  {row.relativePhone && <Chip tone="gray">Relative: {row.relativePhone}</Chip>}
                </div>

                <div className="tea-action-row">
                  <button type="button" onClick={() => toggleActive(row)}>
                    {row.active === false ? "Activate" : "Deactivate"}
                  </button>
                  <button type="button" onClick={() => openEdit(row)}>
                    Edit
                  </button>
                  <button type="button" className="danger" onClick={() => remove(row.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </article>
          );
        })}

        {!filteredRows.length && <EmptyCard text="No teachers found in this branch." />}
      </section>

      {drawerOpen && (
        <div className="tea-drawer-layer">
          <button type="button" aria-label="Close drawer" className="tea-drawer-overlay" onClick={() => setDrawerOpen(false)} />

          <aside className="tea-drawer">
            <div className="tea-drawer-head">
              <div>
                <p>Teacher Record</p>
                <h2>{editMode ? "Edit Teacher" : "Add Teacher"}</h2>
                <span>
                  Teacher will be saved under {activeBranch?.name || "the selected branch"}
                  {activeSchool?.name ? ` under ${activeSchool.name}` : ""}.
                </span>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)}>✕</button>
            </div>

            <div className="tea-form-grid">
              <Field label="Full Name">
                <input
                  value={form.fullName}
                  onChange={(event) => updateForm({ fullName: event.target.value })}
                  placeholder="Teacher full name"
                />
              </Field>

              <div className="tea-form-two">
                <Field label="Gender">
                  <select
                    value={form.gender || ""}
                    onChange={(event) => updateForm({ gender: event.target.value || undefined })}
                  >
                    <option value="">Select gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </Field>

                <Field label="Age">
                  <input
                    type="number"
                    value={form.age ?? ""}
                    onChange={(event) => updateForm({ age: event.target.value === "" ? undefined : Number(event.target.value) })}
                    placeholder="Age"
                  />
                </Field>
              </div>

              <Field label="Role">
                <select
                  value={form.role}
                  onChange={(event) => updateForm({ role: event.target.value as TeacherRole })}
                >
                  <option value="teacher">Teacher</option>
                  <option value="head_teacher">Head Teacher</option>
                  <option value="lecturer">Lecturer</option>
                  <option value="principal">Principal</option>
                </select>
              </Field>

              <Field label="Organization / Department">
                <select
                  value={form.organizationId || ""}
                  onChange={(event) => updateForm({ organizationId: Number(event.target.value) || undefined })}
                >
                  <option value="">No organization</option>
                  {organizations.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} · {row.type}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Qualification">
                <input
                  value={form.qualification || ""}
                  onChange={(event) => updateForm({ qualification: event.target.value })}
                  placeholder="Qualification"
                />
              </Field>

              <div className="tea-form-two">
                <Field label="Email">
                  <input
                    value={form.email || ""}
                    onChange={(event) => updateForm({ email: event.target.value })}
                    placeholder="Email address"
                  />
                </Field>

                <Field label="Phone">
                  <input
                    value={form.phone || ""}
                    onChange={(event) => updateForm({ phone: event.target.value })}
                    placeholder="Phone number"
                  />
                </Field>
              </div>

              <div className="tea-form-two">
                <Field label="Relative Phone">
                  <input
                    value={form.relativePhone || ""}
                    onChange={(event) => updateForm({ relativePhone: event.target.value })}
                    placeholder="Emergency / relative phone"
                  />
                </Field>

                <Field label="Employment Date">
                  <input
                    type="date"
                    value={form.employmentDate || ""}
                    onChange={(event) => updateForm({ employmentDate: event.target.value })}
                  />
                </Field>
              </div>

              <Field label="Salary">
                <input
                  type="number"
                  value={form.salary ?? ""}
                  onChange={(event) => updateForm({ salary: event.target.value === "" ? undefined : Number(event.target.value) })}
                  placeholder="Salary"
                />
              </Field>

              <label className="tea-check">
                <input
                  type="checkbox"
                  checked={form.active !== false}
                  onChange={(event) => updateForm({ active: event.target.checked })}
                />
                <span>Active</span>
              </label>

              <div className="tea-form-two">
                <FileField
                  label="Teacher Photo"
                  value={form.photo}
                  alt="Teacher"
                  onChange={(file) => handleImageUpload("photo", file)}
                />

                <FileField
                  label="Cover Photo"
                  value={form.coverPhoto}
                  alt="Teacher cover"
                  wide
                  onChange={(file) => handleImageUpload("coverPhoto", file)}
                />
              </div>

              <FileField
                label="Signature"
                value={form.signature}
                alt="Teacher signature"
                signature
                onChange={(file) => handleImageUpload("signature", file)}
              />

              <button type="button" onClick={save} disabled={saving} className="tea-save-btn">
                {saving ? "Saving..." : editMode ? "Save Changes" : "Add Teacher"}
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
    <article className="tea-summary-card">
      <div className="tea-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`tea-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="tea-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="tea-empty-card">
      <div className="tea-empty-icon">👩‍🏫</div>
      <h3>No teachers found</h3>
      <p>{text}</p>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="tea-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function FileField({
  label,
  value,
  alt,
  wide,
  signature,
  onChange,
}: {
  label: string;
  value?: string;
  alt: string;
  wide?: boolean;
  signature?: boolean;
  onChange: (file?: File) => void;
}) {
  return (
    <Field label={label}>
      <input type="file" accept="image/*" onChange={(event) => onChange(event.target.files?.[0])} />
      {value && (
        <img
          src={value}
          alt={alt}
          className={signature ? "tea-preview signature" : wide ? "tea-preview wide" : "tea-preview"}
        />
      )}
    </Field>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes teaSpin { to { transform: rotate(360deg); } }

.tea-page {
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
.tea-page *, .tea-page *::before, .tea-page *::after { box-sizing: border-box; }
.tea-page button, .tea-page input, .tea-page select, .tea-page textarea { font: inherit; max-width: 100%; }
.tea-page img { max-width: 100%; }
.tea-page input,
.tea-page select,
.tea-page textarea {
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
.tea-page input[type="file"] {
  padding: 10px;
  font-size: 12px;
}

.tea-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(480px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 24px 60px rgba(15, 23, 42, .08);
  text-align: center;
}
.tea-state-card h2 { margin: 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.04em; }
.tea-state-card p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.tea-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--tea-primary) 18%, transparent); border-top-color: var(--tea-primary); animation: teaSpin .8s linear infinite; }

.tea-primary-btn,
.tea-save-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--tea-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}
.tea-save-btn { width: 100%; }
.tea-primary-btn:disabled,
.tea-save-btn:disabled { opacity: .55; cursor: not-allowed; }

.tea-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--tea-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}
.tea-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }
.tea-hero-icon { width: 46px; height: 46px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; background: var(--tea-primary); color: #fff; box-shadow: 0 12px 26px color-mix(in srgb, var(--tea-primary) 28%, transparent); font-size: 22px; }
.tea-title-wrap { min-width: 0; }
.tea-title-wrap p, .tea-title-wrap h2, .tea-title-wrap span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tea-title-wrap p { margin: 0 0 2px; color: var(--tea-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.tea-title-wrap h2 { margin: 0; font-size: clamp(19px, 5vw, 28px); font-weight: 1000; letter-spacing: -.06em; line-height: 1; }
.tea-title-wrap span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }

.tea-context-card,
.tea-filter-card,
.tea-card,
.tea-empty-card {
  min-width: 0;
  margin-top: 10px;
  border-radius: 24px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .2);
  box-shadow: 0 12px 28px rgba(15, 23, 42, .045);
  overflow: hidden;
}
.tea-context-card {
  padding: 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  background: linear-gradient(135deg, color-mix(in srgb, var(--tea-primary) 10%, #fff), #fff 68%);
}
.tea-context-card p { margin: 0; color: var(--tea-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.tea-context-card h3 { margin: 4px 0 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.05em; }
.tea-context-card span { display: block; margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }
.tea-pill-row { display: flex; flex-wrap: wrap; gap: 7px; }

.tea-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.tea-summary-card {
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
.tea-summary-icon { width: 36px; height: 36px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 15px; background: color-mix(in srgb, var(--tea-primary) 12%, #fff); }
.tea-summary-card div:last-child { min-width: 0; }
.tea-summary-card strong, .tea-summary-card span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tea-summary-card strong { font-size: 20px; font-weight: 1000; letter-spacing: -.05em; }
.tea-summary-card span { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 850; }

.tea-filter-card { padding: 13px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
.tea-list { display: grid; gap: 10px; margin-top: 10px; }
.tea-card { background: linear-gradient(135deg, #fff, #f8fafc); }
.tea-cover { height: 90px; background-size: cover; background-position: center; }
.tea-card-inner { padding: 13px; }
.tea-card-top { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.tea-avatar { width: 56px; height: 56px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 19px; color: #fff; font-weight: 1000; box-shadow: 0 12px 24px rgba(15, 23, 42, .12); }
.tea-main-info { min-width: 0; flex: 1; }
.tea-main-info h3, .tea-main-info p { display: block; overflow: hidden; text-overflow: ellipsis; }
.tea-main-info h3 { margin: 0; font-size: 17px; font-weight: 1000; letter-spacing: -.035em; }
.tea-main-info p { margin: 4px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.4; }
.tea-chip-row, .tea-contact-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.tea-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 25px; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tea-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.tea-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.tea-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.tea-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.tea-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.tea-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }
.tea-mini-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
.tea-mini-stat { min-width: 0; padding: 10px; border-radius: 17px; background: rgba(148, 163, 184, .08); border: 1px solid rgba(148, 163, 184, .12); }
.tea-mini-stat strong, .tea-mini-stat span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tea-mini-stat strong { font-size: 13px; font-weight: 1000; }
.tea-mini-stat span { margin-top: 2px; color: var(--muted, #64748b); font-size: 10px; font-weight: 850; }
.tea-action-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
.tea-action-row button {
  min-height: 40px;
  border: 1px solid rgba(148, 163, 184, .24);
  border-radius: 999px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}
.tea-action-row button.danger { color: #dc2626; background: rgba(239,68,68,.08); border-color: rgba(239,68,68,.13); }
.tea-empty-card { padding: 13px; display: grid; place-items: center; align-content: center; gap: 8px; min-height: 210px; text-align: center; border-style: dashed; }
.tea-empty-icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb, var(--tea-primary) 12%, #fff); font-size: 28px; }
.tea-empty-card h3 { margin: 0; font-size: 18px; font-weight: 1000; }
.tea-empty-card p { margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }

.tea-drawer-layer { position: fixed; inset: 0; z-index: 80; }
.tea-drawer-overlay { position: absolute; inset: 0; border: 0; background: rgba(15, 23, 42, .52); }
.tea-drawer { position: absolute; right: 0; top: 0; bottom: 0; width: min(94vw, 620px); max-width: 100vw; overflow-y: auto; overflow-x: hidden; background: var(--surface, #fff); color: var(--text, #0f172a); padding: 14px; box-shadow: -24px 0 70px rgba(15, 23, 42, .22); }
.tea-drawer-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 6px 0 12px; background: var(--surface, #fff); }
.tea-drawer-head div { min-width: 0; }
.tea-drawer-head p { margin: 0; color: var(--tea-primary); font-size: 11px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.tea-drawer-head h2, .tea-drawer-head span { display: block; overflow: hidden; text-overflow: ellipsis; }
.tea-drawer-head h2 { margin: 2px 0 0; font-size: 24px; font-weight: 1000; letter-spacing: -.05em; }
.tea-drawer-head span { margin-top: 5px; color: var(--muted, #64748b); font-size: 12px; line-height: 1.4; font-weight: 700; }
.tea-drawer-head button { width: 38px; height: 38px; flex: 0 0 auto; border-radius: 999px; border: 1px solid rgba(148, 163, 184, .24); background: var(--surface, #fff); color: var(--text, #0f172a); font-weight: 1000; cursor: pointer; }
.tea-form-grid { display: grid; gap: 12px; }
.tea-form-two { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
.tea-field { display: grid; gap: 6px; min-width: 0; }
.tea-field > span { color: var(--muted, #64748b); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
.tea-check { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 12px; border-radius: 18px; background: rgba(148, 163, 184, .08); border: 1px solid rgba(148, 163, 184, .14); font-size: 13px; font-weight: 850; }
.tea-check input { width: 18px; min-height: 18px; flex: 0 0 auto; }
.tea-preview { width: 92px; height: 84px; border-radius: 16px; margin-top: 8px; object-fit: cover; display: block; border: 1px solid rgba(148, 163, 184, .24); }
.tea-preview.wide { width: 100%; max-width: 260px; }
.tea-preview.signature { width: 180px; height: 72px; object-fit: contain; background: #fff; border-radius: 12px; }

@media (max-width: 390px) {
  .tea-page { padding: 6px; }
  .tea-hero { padding: 10px; border-radius: 24px; flex-wrap: wrap; }
  .tea-hero-icon { width: 42px; height: 42px; border-radius: 16px; }
  .tea-hero .tea-primary-btn { width: 100%; }
  .tea-summary-grid { grid-template-columns: minmax(0, 1fr); }
  .tea-card-top { flex-direction: column; }
  .tea-action-row { grid-template-columns: minmax(0, 1fr); }
}

@media (min-width: 560px) {
  .tea-page { padding: 14px; }
  .tea-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .tea-filter-card { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .tea-mini-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .tea-form-two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .tea-action-row { display: flex; flex-wrap: wrap; justify-content: flex-end; }
  .tea-action-row button { padding: 0 14px; }
}

@media (min-width: 980px) {
  .tea-page { padding: 18px; }
  .tea-summary-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .tea-filter-card { grid-template-columns: minmax(260px, 1.4fr) repeat(4, minmax(150px, 1fr)); }
  .tea-card-inner { padding: 16px; }
  .tea-card-top { align-items: center; }
}
`;
